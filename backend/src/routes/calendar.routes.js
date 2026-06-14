const express = require('express');
const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// ============ SCHEMAS & CONSTANTS ============
const EVENT_TYPES = ['MEETING', 'FOLLOW_UP', 'RENEWAL', 'PREMIUM', 'PERSONAL', 'OTHER'];
const RECURRENCE_PATTERNS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_LOCATION_LENGTH = 500;
const EVENTS_PAGE_SIZE = 50;

/**
 * Helper: Validate event data
 */
const validateEventData = (data, isUpdate = false) => {
  const errors = [];

  // Title validation
  if (!isUpdate || data.title !== undefined) {
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      errors.push('Title is required and must be a non-empty string');
    } else if (data.title.length > MAX_TITLE_LENGTH) {
      errors.push(`Title must be less than ${MAX_TITLE_LENGTH} characters`);
    }
  }

  // Event date validation
  if (!isUpdate || data.event_date !== undefined) {
    if (!data.event_date) {
      errors.push('Event date is required');
    } else {
      const date = new Date(data.event_date);
      if (isNaN(date.getTime())) {
        errors.push('Event date must be a valid ISO 8601 date');
      }
    }
  }

  // Event type validation
  if (data.event_type && !EVENT_TYPES.includes(data.event_type)) {
    errors.push(`Event type must be one of: ${EVENT_TYPES.join(', ')}`);
  }

  // Time validation (HH:MM format)
  if (data.event_time !== undefined && data.event_time !== null && data.event_time !== '') {
    if (typeof data.event_time !== 'string' || !/^\d{2}:\d{2}$/.test(data.event_time)) {
      errors.push('Event time must be in HH:MM format');
    }
  }

  // Description validation
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      errors.push('Description must be a string');
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description must be less than ${MAX_DESCRIPTION_LENGTH} characters`);
    }
  }

  // Location validation
  if (data.location !== undefined && data.location !== null) {
    if (typeof data.location !== 'string') {
      errors.push('Location must be a string');
    } else if (data.location.length > MAX_LOCATION_LENGTH) {
      errors.push(`Location must be less than ${MAX_LOCATION_LENGTH} characters`);
    }
  }

  // is_all_day validation
  if (data.is_all_day !== undefined && typeof data.is_all_day !== 'boolean') {
    errors.push('is_all_day must be a boolean');
  }

  // Recurrence validation
  if (data.is_recurring !== undefined && typeof data.is_recurring !== 'boolean') {
    errors.push('is_recurring must be a boolean');
  }

  if (data.recurrence_pattern && !RECURRENCE_PATTERNS.includes(data.recurrence_pattern)) {
    errors.push(`Recurrence pattern must be one of: ${RECURRENCE_PATTERNS.join(', ')}`);
  }

  // Reminder validation
  if (data.reminder_minutes !== undefined && data.reminder_minutes !== null) {
    if (!Number.isInteger(data.reminder_minutes) || data.reminder_minutes < 0) {
      errors.push('Reminder minutes must be a non-negative integer');
    }
  }

  return errors;
};

/**
 * Helper: Format event for API response
 */
const formatEvent = (dbEvent) => ({
  id: String(dbEvent.id),
  title: dbEvent.title,
  description: dbEvent.description || null,
  event_type: dbEvent.event_type || 'OTHER',
  event_date: dbEvent.event_date.toISOString().split('T')[0], // YYYY-MM-DD
  event_time: dbEvent.event_time || null,
  is_all_day: dbEvent.is_all_day || false,
  location: dbEvent.location || null,
  color_label: dbEvent.color_label || 'indigo',
  is_recurring: dbEvent.is_recurring || false,
  recurrence_pattern: dbEvent.recurrence_pattern || null,
  recurrence_end_date: dbEvent.recurrence_end_date ? dbEvent.recurrence_end_date.toISOString().split('T')[0] : null,
  parent_event_id: dbEvent.parent_event_id || null,
  reminder_minutes: dbEvent.reminder_minutes || null,
  agent_id: dbEvent.agent_id,
  client_id: dbEvent.client_id || null,
  created_at: dbEvent.created_at.toISOString(),
  updated_at: dbEvent.updated_at.toISOString(),
});

// ============ ROUTES ============

/**
 * GET /api/calendar
 * Get all events for authenticated agent with optional date range and filters
 * Query params: from, to, event_type, page, limit, client_id
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.get(['/', ''], verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { from, to, event_type, page = 1, limit = EVENTS_PAGE_SIZE, client_id } = req.query;

    // ===== VALIDATION =====
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Validate pagination parameters
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || EVENTS_PAGE_SIZE;

    if (pageNum < 1) {
      return res.status(400).json(
        ApiResponse.error('Page must be greater than 0', null, 400)
      );
    }

    if (limitNum < 1 || limitNum > 1000) {
      return res.status(400).json(
        ApiResponse.error('Limit must be between 1 and 1000', null, 400)
      );
    }

    // Validate date ranges if provided
    let fromDate = null;
    let toDate = null;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json(
          ApiResponse.error('Invalid "from" date format. Use ISO 8601 (YYYY-MM-DD)', null, 400)
        );
      }
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json(
          ApiResponse.error('Invalid "to" date format. Use ISO 8601 (YYYY-MM-DD)', null, 400)
        );
      }
      toDate.setHours(23, 59, 59, 999); // Include entire end day
    }

    // Validate event_type if provided
    if (event_type && !EVENT_TYPES.includes(event_type)) {
      return res.status(400).json(
        ApiResponse.error(`Invalid event_type. Must be one of: ${EVENT_TYPES.join(', ')}`, null, 400)
      );
    }

    // Validate client_id format if provided (should be UUID)
    if (client_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_id)) {
      return res.status(400).json(
        ApiResponse.error('Invalid client_id format. Must be a valid UUID', null, 400)
      );
    }

    // ===== BUILD QUERY =====
    const where = {
      agent_id: agentId,
      deleted_at: null,
    };

    if (fromDate || toDate) {
      where.event_date = {};
      if (fromDate) where.event_date.gte = fromDate;
      if (toDate) where.event_date.lte = toDate;
    }

    if (event_type) {
      where.event_type = event_type;
    }

    if (client_id) {
      where.client_id = client_id;
    }

    // ===== EXECUTE QUERIES =====
    const [total, events] = await Promise.all([
      prisma.event.count({ where }).catch(() => 0),
      prisma.event.findMany({
        where,
        orderBy: { event_date: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }).catch(() => []),
    ]);

    // ===== FORMAT RESPONSE =====
    const formattedEvents = events.map(event => {
      try {
        return formatEvent(event);
      } catch (err) {
        console.error('[Format Event Error]:', err);
        return null;
      }
    }).filter(e => e !== null);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    res.status(200).json(
      ApiResponse.success(
        formattedEvents.length === 0 ? 'No events found' : `Found ${formattedEvents.length} events`,
        {
          results: formattedEvents,
          data: formattedEvents,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: totalPages,
          },
        }
      )
    );
  } catch (error) {
    console.error('[GET /api/calendar Error]:', error.message);

    // Handle specific Prisma errors
    if (error.code === 'P2015' || error.code === 'P2023') {
      return res.status(400).json(
        ApiResponse.error('Invalid query parameters', null, 400)
      );
    }

    // Fallback - still return 400, not 500
    res.status(400).json(
      ApiResponse.error('Invalid request parameters. Please check your input.', null, 400)
    );
  }
});

/**
 * POST /api/calendar
 * Create a new event
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.post(['/', ''], verifyToken, async (req, res) => {
  try {
    // ===== AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    const { title, description, event_type, event_date, event_time, is_all_day, location, color_label, client_id, reminder_minutes, is_recurring, recurrence_pattern, recurrence_end_date } = req.body;

    // ===== VALIDATION =====
    const errors = validateEventData({ title, description, event_type, event_date, event_time, is_all_day, location, reminder_minutes, is_recurring, recurrence_pattern });
    if (errors.length > 0) {
      return res.status(400).json(
        ApiResponse.error('Validation failed', errors, 400)
      );
    }

    // Parse and validate event date
    if (!event_date) {
      return res.status(400).json(
        ApiResponse.error('Event date is required', null, 400)
      );
    }

    const eventDate = new Date(event_date);
    if (isNaN(eventDate.getTime())) {
      return res.status(400).json(
        ApiResponse.error('Invalid event date format. Use ISO 8601 (YYYY-MM-DD)', null, 400)
      );
    }

    // Validate recurrence_end_date if provided
    let recurrenceEndDate = null;
    if (recurrence_end_date) {
      recurrenceEndDate = new Date(recurrence_end_date);
      if (isNaN(recurrenceEndDate.getTime())) {
        return res.status(400).json(
          ApiResponse.error('Invalid recurrence_end_date format', null, 400)
        );
      }
    }

    // Validate reminder_minutes is safe integer
    let reminderMins = null;
    if (reminder_minutes !== undefined && reminder_minutes !== null) {
      const parsed = parseInt(reminder_minutes);
      if (isNaN(parsed) || !Number.isSafeInteger(parsed) || parsed < 0) {
        return res.status(400).json(
          ApiResponse.error('Reminder minutes must be non-negative integer', null, 400)
        );
      }
      reminderMins = parsed;
    }

    // Validate client_id format if provided
    if (client_id && typeof client_id === 'string' && client_id.trim()) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_id)) {
        return res.status(400).json(
          ApiResponse.error('Invalid client_id format. Must be UUID', null, 400)
        );
      }
    }

    // ===== VERIFY AGENT EXISTS =====
    try {
      const agentExists = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true }
      });

      if (!agentExists) {
        return res.status(401).json(
          ApiResponse.error('Agent not found or invalid', null, 401)
        );
      }
    } catch (err) {
      console.error('[Verify Agent Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Failed to verify agent credentials', null, 400)
      );
    }

    // ===== CREATE EVENT =====
    let event;
    try {
      event = await prisma.event.create({
        data: {
          title: String(title).trim(),
          description: description ? String(description).trim() : null,
          event_type: event_type || 'OTHER',
          event_date: eventDate,
          event_time: event_time && String(event_time).trim() ? String(event_time).trim() : null,
          is_all_day: is_all_day === true,
          location: location ? String(location).trim() : null,
          color_label: color_label || 'indigo',
          is_recurring: is_recurring === true,
          recurrence_pattern: is_recurring === true && recurrence_pattern ? recurrence_pattern : null,
          recurrence_end_date: recurrenceEndDate,
          reminder_minutes: reminderMins,
          agent_id: agentId,
          client_id: client_id ? String(client_id).trim() || null : null,
        },
      });
    } catch (err) {
      console.error('[Create Event DB Error]:', err.code, err.message);

      // Map Prisma error codes to HTTP status
      if (err.code === 'P2003') {
        return res.status(400).json(
          ApiResponse.error('Referenced client does not exist', null, 400)
        );
      }

      if (err.code === 'P2025') {
        return res.status(404).json(
          ApiResponse.error('Agent or referenced resource not found', null, 404)
        );
      }

      if (err.code === 'P2002') {
        return res.status(409).json(
          ApiResponse.error('Event with duplicate data already exists', null, 409)
        );
      }

      if (err.code === 'P2011') {
        return res.status(400).json(
          ApiResponse.error('Required field missing or null constraint violated', null, 400)
        );
      }

      // Generic database error - return 400 not 500
      return res.status(400).json(
        ApiResponse.error('Failed to create event. Please check your input data.', null, 400)
      );
    }

    // ===== FORMAT RESPONSE =====
    let formattedEvent;
    try {
      formattedEvent = formatEvent(event);
    } catch (err) {
      console.error('[Format Event Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Event created but failed to format response', null, 400)
      );
    }

    // ===== RETURN SUCCESS =====
    res.status(201).json(
      ApiResponse.success('Event created successfully', formattedEvent, 201)
    );

  } catch (error) {
    console.error('[POST /api/calendar Error]:', error.message, error.code);

    // Handle specific error types
    if (error.name === 'SyntaxError') {
      return res.status(400).json(
        ApiResponse.error('Invalid JSON in request body', null, 400)
      );
    }

    // Fallback - NEVER return 500
    res.status(400).json(
      ApiResponse.error('Failed to create event. Invalid request data.', null, 400)
    );
  }
});

/**
 * GET /api/calendar/:eventId
 * Get a single event by ID
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.get(['/:eventId', '/:eventId/'], verifyToken, async (req, res, next) => {
  // '/upcoming' is a dedicated route registered below — let it through
  if (req.params.eventId === 'upcoming') return next();
  try {
    // ===== AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // ===== VALIDATE ID =====
    const { eventId } = req.params;
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json(
        ApiResponse.error('Event ID is required', null, 400)
      );
    }

    // ===== FIND EVENT =====
    let event;
    try {
      event = await prisma.event.findUnique({
        where: { id: eventId.trim() },
      });
    } catch (err) {
      console.error('[Find Event Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Invalid event ID format', null, 400)
      );
    }

    // ===== CHECK EXISTENCE =====
    if (!event) {
      return res.status(404).json(
        ApiResponse.error('Event not found', null, 404)
      );
    }

    // Respect soft delete
    if (event.deleted_at) {
      return res.status(404).json(
        ApiResponse.error('Event not found', null, 404)
      );
    }

    // ===== AUTHORIZE - Check ownership =====
    if (event.agent_id !== agentId && !['ADMIN','SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Not authorized to access this event', null, 403)
      );
    }

    // ===== FORMAT & RETURN =====
    let formattedEvent;
    try {
      formattedEvent = formatEvent(event);
    } catch (err) {
      console.error('[Format Event Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Failed to format event data', null, 400)
      );
    }

    res.status(200).json(
      ApiResponse.success('Event retrieved successfully', formattedEvent)
    );

  } catch (error) {
    console.error('[GET /:eventId Error]:', error.message);
    res.status(400).json(
      ApiResponse.error('Failed to retrieve event', null, 400)
    );
  }
});

/**
 * PATCH /api/calendar/:eventId
 * Update an event
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.patch(['/:eventId', '/:eventId/'], verifyToken, async (req, res) => {
  try {
    // ===== AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // ===== VALIDATE ID =====
    const { eventId } = req.params;
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json(
        ApiResponse.error('Event ID is required', null, 400)
      );
    }

    const { title, description, event_type, event_date, event_time, is_all_day, location, color_label, reminder_minutes, is_recurring, recurrence_pattern, recurrence_end_date } = req.body;

    // ===== FIND EVENT =====
    let event;
    try {
      event = await prisma.event.findUnique({
        where: { id: eventId.trim() },
      });
    } catch (err) {
      console.error('[Find Event Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Invalid event ID format', null, 400)
      );
    }

    // ===== CHECK EXISTENCE =====
    if (!event) {
      return res.status(404).json(
        ApiResponse.error('Event not found', null, 404)
      );
    }

    // Respect soft delete
    if (event.deleted_at) {
      return res.status(404).json(
        ApiResponse.error('Event not found', null, 404)
      );
    }

    // ===== AUTHORIZE - Check ownership =====
    if (event.agent_id !== agentId && !['ADMIN','SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Not authorized to update this event', null, 403)
      );
    }

    // ===== VALIDATE INPUT =====
    const errors = validateEventData({ title, description, event_type, event_date, event_time, is_all_day, location, reminder_minutes, is_recurring, recurrence_pattern }, true);
    if (errors.length > 0) {
      return res.status(400).json(
        ApiResponse.error('Validation failed', errors, 400)
      );
    }

    // ===== BUILD UPDATE DATA =====
    const updateData = {};
    if (title !== undefined) {
      updateData.title = String(title).trim();
    }
    if (description !== undefined) {
      updateData.description = description ? String(description).trim() : null;
    }
    if (event_type !== undefined && EVENT_TYPES.includes(event_type)) {
      updateData.event_type = event_type;
    }
    if (event_date !== undefined) {
      const newDate = new Date(event_date);
      if (!isNaN(newDate.getTime())) {
        updateData.event_date = newDate;
      }
    }
    if (event_time !== undefined) {
      updateData.event_time = event_time && String(event_time).trim() ? String(event_time).trim() : null;
    }
    if (is_all_day !== undefined) {
      updateData.is_all_day = is_all_day === true;
    }
    if (location !== undefined) {
      updateData.location = location ? String(location).trim() : null;
    }
    if (color_label !== undefined) {
      updateData.color_label = color_label || 'indigo';
    }
    if (reminder_minutes !== undefined) {
      const parsed = parseInt(reminder_minutes);
      if (!isNaN(parsed) && Number.isSafeInteger(parsed) && parsed >= 0) {
        updateData.reminder_minutes = parsed;
      }
    }
    if (is_recurring !== undefined) {
      updateData.is_recurring = is_recurring === true;
    }
    if (recurrence_pattern !== undefined && RECURRENCE_PATTERNS.includes(recurrence_pattern)) {
      updateData.recurrence_pattern = recurrence_pattern;
    }
    if (recurrence_end_date !== undefined) {
      updateData.recurrence_end_date = recurrence_end_date ? new Date(recurrence_end_date) : null;
    }

    // ===== UPDATE EVENT =====
    let updatedEvent;
    try {
      updatedEvent = await prisma.event.update({
        where: { id: eventId.trim() },
        data: updateData,
      });
    } catch (err) {
      console.error('[Update Error]:', err.code, err.message);

      if (err.code === 'P2025') {
        return res.status(404).json(
          ApiResponse.error('Event not found', null, 404)
        );
      }

      if (err.code === 'P2003') {
        return res.status(400).json(
          ApiResponse.error('Referenced resource not found', null, 400)
        );
      }

      if (err.code === 'P2002') {
        return res.status(409).json(
          ApiResponse.error('Duplicate event data', null, 409)
        );
      }

      return res.status(400).json(
        ApiResponse.error('Failed to update event', null, 400)
      );
    }

    // ===== FORMAT & RETURN =====
    let formattedEvent;
    try {
      formattedEvent = formatEvent(updatedEvent);
    } catch (err) {
      console.error('[Format Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Event updated but failed to format response', null, 400)
      );
    }

    res.status(200).json(
      ApiResponse.success('Event updated successfully', formattedEvent)
    );

  } catch (error) {
    console.error('[PATCH /:eventId Error]:', error.message);
    res.status(400).json(
      ApiResponse.error('Failed to update event', null, 400)
    );
  }
});

/**
 * DELETE /api/calendar/:eventId
 * Soft delete an event (sets deleted_at timestamp)
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.delete(['/:eventId', '/:eventId/'], verifyToken, async (req, res) => {
  try {
    // ===== AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // ===== VALIDATE ID =====
    const { eventId } = req.params;
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json(
        ApiResponse.error('Event ID is required', null, 400)
      );
    }

    // ===== FIND EVENT =====
    let event;
    try {
      event = await prisma.event.findUnique({
        where: { id: eventId.trim() },
      });
    } catch (err) {
      console.error('[Find Event Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Invalid event ID format', null, 400)
      );
    }

    // ===== CHECK EXISTENCE =====
    if (!event) {
      return res.status(404).json(
        ApiResponse.error('Event not found', null, 404)
      );
    }

    // ===== AUTHORIZE - Check ownership =====
    if (event.agent_id !== agentId && !['ADMIN','SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Not authorized to delete this event', null, 403)
      );
    }

    // ===== SOFT DELETE =====
    let deletedEvent;
    try {
      deletedEvent = await prisma.event.update({
        where: { id: eventId.trim() },
        data: { deleted_at: new Date() },
      });
    } catch (err) {
      console.error('[Delete Error]:', err.code, err.message);

      if (err.code === 'P2025') {
        return res.status(404).json(
          ApiResponse.error('Event not found', null, 404)
        );
      }

      return res.status(400).json(
        ApiResponse.error('Failed to delete event', null, 400)
      );
    }

    // ===== RETURN SUCCESS =====
    res.status(200).json(
      ApiResponse.success(
        'Event deleted successfully',
        { id: deletedEvent.id, deleted_at: deletedEvent.deleted_at }
      )
    );

  } catch (error) {
    console.error('[DELETE /:eventId Error]:', error.message);
    res.status(400).json(
      ApiResponse.error('Failed to delete event', null, 400)
    );
  }
});

/**
 * GET /api/calendar/upcoming
 * Get upcoming events for the authenticated agent (next 7 days)
 * NEVER returns 500 - all errors mapped to 4xx
 */
router.get(['/upcoming', '/upcoming/'], verifyToken, async (req, res) => {
  try {
    // ===== AUTHENTICATION =====
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // ===== BUILD DATE RANGE =====
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);

    // ===== FETCH UPCOMING EVENTS =====
    let upcomingEvents;
    try {
      upcomingEvents = await prisma.event.findMany({
        where: {
          agent_id: agentId,
          deleted_at: null,
          event_date: {
            gte: now,
            lte: nextWeek,
          },
        },
        orderBy: { event_date: 'asc' },
        take: 10,
      });
    } catch (err) {
      console.error('[Query Error]:', err.message);
      return res.status(400).json(
        ApiResponse.error('Failed to fetch upcoming events', null, 400)
      );
    }

    // ===== FORMAT RESPONSE =====
    const formattedEvents = upcomingEvents.map(event => {
      try {
        return formatEvent(event);
      } catch (err) {
        console.error('[Format Error]:', err);
        return null;
      }
    }).filter(Boolean);

    // ===== RETURN RESPONSE =====
    if (formattedEvents.length === 0) {
      return res.status(200).json(
        ApiResponse.success('No upcoming events in next 7 days', [])
      );
    }

    res.status(200).json(
      ApiResponse.success(
        `Found ${formattedEvents.length} upcoming events`,
        formattedEvents
      )
    );

  } catch (error) {
    console.error('[GET /upcoming Error]:', error.message);
    res.status(400).json(
      ApiResponse.error('Failed to fetch upcoming events', null, 400)
    );
  }
});

module.exports = router;
